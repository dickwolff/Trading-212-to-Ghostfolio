export class Trading212Record {
    action: string;
    time: Date;
    isin: string;
    ticker: string;
    name: string;
    noOfShares: number
    priceShare: number;
    currencyPriceShare: string;
    exchangeRate: number;
    totalPrice: number;
    withholdingTax: number;
    currencyWithholdingTax: number;
    chargeAmount: number;
    notes: string;
    id: string;
}
