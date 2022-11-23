import { GhostfolioExport } from "../models/ghostfolioExport";
import * as fs from "fs";
import dayjs from "dayjs"
import fetch from "cross-fetch";
import { parse } from "csv-parse";
import { Trading212Record } from "../models/trading212Record";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

require("dotenv").config();

// Define import file path.
const inputFile = process.env.INPUT_FILE;

// Header mapping from the Trading 212 CSV export.
const csvHeaders = [
    "action",
    "time",
    "isin",
    "ticker",
    "name",
    "noShares",
    "priceShare",
    "currency",
    "exchangeRate",
    "total",
    "withholdingTax",
    "currencyWithholdingTax",
    "chargeAmount",
    "notes",
    "id"];
const csvFile = fs.readFileSync(inputFile, "utf-8");

// Parse the CSV and convert to Ghostfolio import format.
parse(csvFile, {
    delimiter: ",",
    fromLine: 2,
    columns: csvHeaders,
    cast: (columnValue, context) => {

        // Custom mapping below.

        // Convert actions to Ghostfolio type.
        if (context.column === "action") {
            const action = columnValue.toLocaleLowerCase();

            if (action.indexOf("buy") > -1) {
                return "buy";
            }
            else if (action.indexOf("sell") > -1) {
                return "sell";
            }
            else if (action.indexOf("dividend") > -1) {
                return "dividend";
            }
        }

        // Parse numbers to floats (from string).
        if (context.column === "noShares" ||
            context.column === "priceShare") {
            return parseFloat(columnValue);
        }

        // Patch GBX currency (should be GBp).
        if (context.column === "currency") {
            if (columnValue == "GBX") {
                return "GBp";
            }
        }

        return columnValue;
    }
}, async (_, records: Trading212Record[]) => {

    let errorExport = false;

    console.log(`Read CSV file ${inputFile}. Start processing..`);
    const exportFile: GhostfolioExport = {
        meta: {
            date: new Date(),
            version: "v0"
        },
        activities: []
    }

    // Retrieve bearer token for authentication.
    const bearerResponse = await fetch(`${process.env.GHOSTFOLIO_API_URL}/api/v1/auth/anonymous/${process.env.GHOSTFOLIO_SECRET}`);
    const bearer = await bearerResponse.json();

    for (let idx = 0; idx < records.length; idx++) {
        const record = records[idx];

        console.log(`\tProcessing ${idx + 1} of ${records.length}`);

        // Skip deposit/withdraw transactions.
        if (record.action.toLocaleLowerCase().indexOf("deposit") > -1 || 
            record.action.toLocaleLowerCase().indexOf("withdraw") > -1) {
            continue;
        }
        
        // Retrieve YAHOO Finance ticker that corresponds to the ISIN from Trading 212 record.
        const tickerUrl = `${process.env.GHOSTFOLIO_API_URL}/api/v1/symbol/lookup?query=${record.isin}`;
        const tickerResponse = await fetch(tickerUrl, {
            method: "GET",
            headers: [["Authorization", `Bearer ${bearer.authToken}`]]
        });

        // Check if response was not unauthorized.
        if (tickerResponse.status === 401) {
            console.error("Ghostfolio access token is not valid!");
            errorExport = true;
            break;
        }

        const tickers = await tickerResponse.json();

        // Add record to export.
        exportFile.activities.push({
            accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
            comment: record.notes,
            fee: 0,
            quantity: record.noShares,
            type: GhostfolioOrderType[record.action],
            unitPrice: record.priceShare,
            currency: record.currency,
            dataSource: "YAHOO",
            date: dayjs(record.time).format("YYYY-MM-DDTHH:mm:ssZ"),
            symbol: tickers.items[0].symbol
        });
    }

    // Only export when no error has occured.
    if (!errorExport) {

        console.log("Processing complete, writing to file..")

        const result = JSON.stringify(exportFile);
        fs.writeFileSync("ghostfolio-t212.json", result, { encoding: "utf-8" });

        console.log("Wrote data to 'ghostfolio-t212.json'!");
    }
});
