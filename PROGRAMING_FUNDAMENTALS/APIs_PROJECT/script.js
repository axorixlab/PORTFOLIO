
const apiURL = "https://api.gold-api.com/price/XAU";

const refreshBtn = document.getElementById("refreshBtn");
const currencySearch = document.getElementById("currencySearch");
const applyCurrencyBtn = document.getElementById("applyCurrencyBtn");

const status = document.getElementById("status");
const currencyStatus = document.getElementById("currencyStatus");

let latestPrices = null;
let selectedCurrency = "USD";
let exchangeRates = { USD: 1 };


// COUNTRY AND CURRENCY DATABASE

const currencies = {
    "PAKISTAN": "PKR",
    "PKR": "PKR",

    "UNITED STATES": "USD",
    "USA": "USD",
    "USD": "USD",

    "UNITED KINGDOM": "GBP",
    "UK": "GBP",
    "GBP": "GBP",

    "EUROZONE": "EUR",
    "EUR": "EUR",

    "UNITED ARAB EMIRATES": "AED",
    "UAE": "AED",
    "AED": "AED",

    "SAUDI ARABIA": "SAR",
    "SAR": "SAR",

    "KUWAIT": "KWD",
    "KWD": "KWD",

    "INDIA": "INR",
    "INR": "INR",

    "CANADA": "CAD",
    "CAD": "CAD",

    "AUSTRALIA": "AUD",
    "AUD": "AUD",

    "JAPAN": "JPY",
    "JPY": "JPY",

    "CHINA": "CNY",
    "CNY": "CNY",

    "QATAR": "QAR",
    "QAR": "QAR",

    "BAHRAIN": "BHD",
    "BHD": "BHD",

    "OMAN": "OMR",
    "OMR": "OMR",

    "MALAYSIA": "MYR",
    "MYR": "MYR",

    "SINGAPORE": "SGD",
    "SGD": "SGD",

    "SWITZERLAND": "CHF",
    "CHF": "CHF",

    "SOUTH AFRICA": "ZAR",
    "ZAR": "ZAR"
};


// FIND CURRENCY

function getCurrencyCode(searchText) {

    const value = searchText.trim().toUpperCase();

    if (!value) {
        return null;
    }

    // Supports Pakistan - PKR format
    const parts = value.split("-");
    const lastPart = parts[parts.length - 1].trim();

    if (currencies[lastPart]) {
        return currencies[lastPart];
    }

    if (currencies[value]) {
        return currencies[value];
    }

    return null;
}


// FORMAT MONEY

function formatMoney(amount, currency) {

    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency,
        maximumFractionDigits: 2
    }).format(amount);

}


// DISPLAY GOLD PRICES

function displayPrices() {

    if (!latestPrices) {
        return;
    }

    const rate = exchangeRates[selectedCurrency];

    document.getElementById("goldPrice").textContent =
        formatMoney(latestPrices.ounce * rate, selectedCurrency);

    document.getElementById("price24").textContent =
        formatMoney(latestPrices.price24 * rate, selectedCurrency);

    document.getElementById("price22").textContent =
        formatMoney(latestPrices.price22 * rate, selectedCurrency);

    document.getElementById("price21").textContent =
        formatMoney(latestPrices.price21 * rate, selectedCurrency);

    document.getElementById("price18").textContent =
        formatMoney(latestPrices.price18 * rate, selectedCurrency);

}


// GET EXCHANGE RATES

async function getExchangeRates(currency) {

    currencyStatus.textContent =
        "Fetching " + currency + " exchange rate...";

    const response = await fetch(
        "https://open.er-api.com/v6/latest/USD"
    );

    if (!response.ok) {
        throw new Error("Currency API request failed");
    }

    const data = await response.json();

    if (
        data.result !== "success" ||
        !data.rates ||
        !data.rates[currency]
    ) {
        throw new Error("Currency not supported by exchange API");
    }

    exchangeRates = data.rates;

    selectedCurrency = currency;

    displayPrices();

    currencyStatus.textContent =
        "Showing gold prices in " + currency;

}


// SEARCH CURRENCY BUTTON

applyCurrencyBtn.addEventListener("click", async function() {

    const searchValue = currencySearch.value;

    const currency = getCurrencyCode(searchValue);

    if (!currency) {

        currencyStatus.textContent =
            "Currency not found. Try Pakistan, PKR, Kuwait or USD.";

        return;
    }

    applyCurrencyBtn.disabled = true;

    try {

        if (currency === "USD") {

            selectedCurrency = "USD";
            exchangeRates = { USD: 1 };

            displayPrices();

            currencyStatus.textContent =
                "Showing prices in USD.";

        } else {

            await getExchangeRates(currency);

        }

    } catch (error) {

        currencyStatus.textContent =
            error.message + ". Please try again.";

    } finally {

        applyCurrencyBtn.disabled = false;

    }

});


// PRESS ENTER TO SEARCH

currencySearch.addEventListener("keydown", function(event) {

    if (event.key === "Enter") {
        applyCurrencyBtn.click();
    }

});


// ORIGINAL GOLD API FUNCTION

async function getGoldPrice() {

    try {

        status.textContent = "Fetching gold price...";

        refreshBtn.disabled = true;

        // 1. Send GET request

        const response = await fetch(apiURL);

        // 2. Check HTTP response

        if (!response.ok) {

            throw new Error("HTTP Error: " + response.status);

        }

        // 3. Convert JSON into JavaScript object

        const data = await response.json();

        // 4. Get gold price

        const ouncePrice = Number(data.price);

        if (!Number.isFinite(ouncePrice) || ouncePrice <= 0) {

            throw new Error("Invalid gold price received");

        }

        // 5. Convert Troy ounce into grams

        const gramPrice = ouncePrice / 31.1035;

        // 6. Calculate karat prices

        const price24 = gramPrice;

        const price22 = gramPrice * (22 / 24);

        const price21 = gramPrice * (21 / 24);

        const price18 = gramPrice * (18 / 24);

        // 7. Store original USD prices

        latestPrices = {

            ounce: ouncePrice,

            price24: price24,

            price22: price22,

            price21: price21,

            price18: price18

        };

        // 8. Display converted prices

        displayPrices();

        // 9. Update time

        const date = new Date(data.updatedAt);

        document.getElementById("updatedAt").textContent =
            "Updated: " + date.toLocaleString();

        status.textContent = "Gold price loaded successfully!";

    }

    catch (error) {

        console.error(error);

        status.textContent = "Error: " + error.message;

    }

    finally {

        refreshBtn.disabled = false;

    }

}


// REFRESH BUTTON

refreshBtn.addEventListener("click", getGoldPrice);


// LOAD PRICE WHEN WEBSITE OPENS

getGoldPrice();
