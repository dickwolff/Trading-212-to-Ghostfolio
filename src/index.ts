import { GhostfolioExport } from "../models/ghostfolioExport";
import * as fs from "fs";
import dayjs from "dayjs"
import fetch from "cross-fetch";
import { parse } from "csv-parse";
import { Trading212Record } from "../models/trading212Record";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
import cliProgesss from "cli-progress";

require("dotenv").config();

// Define import file path.
const inputFile = process.env.INPUT_FILE;

// Generic header mapping from the Trading 212 CSV export.
const csvHeaders = [];

// Read file contents of the CSV export.
const csvFile = fs.readFileSync(inputFile, "utf-8");

// Get header line and split in columns.
const firstLine = csvFile.split('\n')[0];
const colsInFile = firstLine.split(',');

for (let idx = 0; idx <= colsInFile.length; idx++) {

    // Ignore empty columns.
    if (!colsInFile[idx]) {
        continue;
    }
    // Replace all charachters except a-z, and camelCase the string.
    let col: string = camelize(colsInFile[idx]);

    // Manual polishing..
    if (col === "iSIN") {
        col = col.toLocaleLowerCase();
    } else if (col.endsWith("EUR")) {
        col = col.slice(0, -3) + "Eur";
    }

    csvHeaders.push(col);
}

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
        if (context.column === "noOfShares" ||
            context.column === "priceShare") {
            return parseFloat(columnValue);
        }

        // Patch GBX currency (should be GBp).
        if (context.column === "currencyPriceShare") {
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

    // Start progress bar.
    const progress = new cliProgesss.SingleBar({}, cliProgesss.Presets.shades_classic);
    progress.start(records.length - 1, 0);

    for (let idx = 0; idx < records.length; idx++) {
        const record = records[idx];
        progress.update(idx);

        // Skip deposit/withdraw transactions.
        if (record.action.toLocaleLowerCase().indexOf("deposit") > -1 ||
            record.action.toLocaleLowerCase().indexOf("withdraw") > -1) {
            continue;
        }

        let ticker: any;
        try { ticker = await getTicker(bearer.authToken, record); }
        catch (err) {
            errorExport = true;
            break;
        }

        // Log whenever there was no match found.
        if (!ticker) {
            throw new Error(`Could not find a match for ticker ${record.ticker} with currency ${record.currencyPriceShare}`);
        }

        // Add record to export.
        exportFile.activities.push({
            accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
            comment: "",
            fee: 0,
            quantity: record.noOfShares,
            type: GhostfolioOrderType[record.action],
            unitPrice: record.priceShare,
            currency: record.currencyPriceShare,
            dataSource: "YAHOO",
            date: dayjs(record.time).format("YYYY-MM-DDTHH:mm:ssZ"),
            symbol: ticker.symbol
        });
    }

    progress.stop();

    // Only export when no error has occured.
    if (!errorExport) {

        console.log("Processing complete, writing to file..")

        const result = JSON.stringify(exportFile);
        fs.writeFileSync("ghostfolio-t212.json", result, { encoding: "utf-8" });

        console.log("Wrote data to 'ghostfolio-t212.json'!");
    }
});

function camelize(str) {
    return str.replace(/[^a-zA-Z ]/g, "").replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
}

/**
 * Get tickers for a security.
 * 
 * @param authToken The authorization bearer token
 * @param isin The isin of the security
 * @param ticker The ticker of the security
 * @returns The tickers that are retrieved from Ghostfolio.
 */
async function getTicker(authToken, record): Promise<any> {

    // First try by ISIN.
    let tickers = await getTickersByQuery(authToken, record.isin);

    // If no result found by ISIN, try by ticker.
    if (tickers.length == 0) {
        tickers = await getTickersByQuery(authToken, record.ticker);
    }

    // Find a symbol that has the same currency.
    let tickerMatch = tickers.find(i => i.currency === record.currencyPriceShare);

    // If no currency match has been found, try to query Ghostfolio by ticker exclusively and search again.
    if (!tickerMatch) {
        const queryByTicker = await getTickersByQuery(authToken, record.ticker);
        tickerMatch = queryByTicker.find(i => i.currency === record.currencyPriceShare);
    }

    // If still no currency match has been found, try to query Ghostfolio by name exclusively and search again.
    if (!tickerMatch) {
        const queryByTicker = await getTickersByQuery(authToken, record.name);
        tickerMatch = queryByTicker.find(i => i.currency === record.currencyPriceShare);
    }

    return tickerMatch;
}

/**
 * Get tickers for a security by a given key.
 * 
 * @param authToken The authorization bearer token.
 * @param query The security identification to query by.
 * @returns The tickers that are retrieved from Ghostfolio, if any.
 */
async function getTickersByQuery(authToken, query): Promise<any> {

    // Retrieve YAHOO Finance ticker that corresponds to the ISIN from Trading 212 record.
    const tickerUrl = `${process.env.GHOSTFOLIO_API_URL}/api/v1/symbol/lookup?query=${query}`;
    const tickerResponse = await fetch(tickerUrl, {
        method: "GET",
        headers: [["Authorization", `Bearer ${authToken}`]]
    });

    // Check if response was not unauthorized.
    if (tickerResponse.status === 401) {
        console.error("Ghostfolio access token is not valid!");
        throw new Error("Ghostfolio access token is not valid!");
    }

    var response = await tickerResponse.json();

    return response.items;
}
