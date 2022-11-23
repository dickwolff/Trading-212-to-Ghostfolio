# Trading 212 to Ghostfolio

This tool allows you to convert a [Trading 212](https://trading212.com) transaction export (CSV) to an import file that can be read by [Ghostfolio](https://github.com/ghostfolio/ghostfolio/). 

**NOTICE: It is recommended to only use this when you have a local instance of Ghostfolio, so you don't spam the online service hosted by Ghostfolio!**

## How to use

Clone the repo to your local machine and open with your editor of choice (e.g. Visual Studio Code).

Run `npm install` to install all required packages.

The repository contains a sample `.env` file. Rename this from `.env.sample`.

- Put your Trading 212 export file path in the `INPUT_FILE` variable.
- Put the Ghostfolio account name where you want your transactions to end up at in `GHOSTFOLIO_ACCOUNT_ID` 
  - This can be retrieved by going to Accounts > select your account and copying the ID from the URL 
    ![image](https://user-images.githubusercontent.com/5620002/203353840-f5db7323-fb2f-4f4f-befc-e4e340466a74.png)
- Put your local Ghostfolio endpoint in `GHOSTFOLIO_API_URL`. This is your hostname/ip address with port number (e.g. `http://192.168.1.55:3333`)
- Put a valid bearer token in `GHOSTFOLIO_AUTH_HEADER`. 
  - This can be retrieved by opening the developer tools of your browser (in Chrome this is F12) and navigating to the Network tab. 
  - Refresh the page and look for an API call to the `user` endpoint. Click this to open the request info.
  ![image](https://user-images.githubusercontent.com/5620002/203354878-6a94925b-196b-44dc-9916-61f9b941c42a.png)
  - Go to request headers and search for the `Authorization` header. Copy the value and paste in `GHOSTFOLIO_AUTH_HEADER`
  
You can now run `npm run start`. The tool will open your Trading 212 export and will convert this. It retrieves the tickers that are supported YAHOO Finance (e.g. for European stocks like `ASML`, it will retrieve `ASML.AS` by the corresponding ISIN). 
  
The export file can now be imported in Ghostfolio by going to Portfolio > Activities and pressing the 3 dots at the top right of the table. Select your file and wait for the job to complete.

![image](https://user-images.githubusercontent.com/5620002/203356387-1f42ca31-7cff-44a5-8f6c-84045cf7101e.png)
