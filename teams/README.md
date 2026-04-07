# Teams Packaging

This folder contains the Mastiff Teams app scaffold.

## What is here

- `manifest.template.json`: Teams personal-tab manifest with placeholders.
- `dist/manifest.json`: generated manifest output after running the render script.
- `assets/color.png`: Teams color icon target.
- `assets/outline.png`: Teams outline icon target.

## Required environment variables

- `APP_URL`: public HTTPS URL of the Mastiff deployment.
- `TEAMS_APP_ID`: unique Teams app ID GUID.

Optional manifest metadata:

- `TEAMS_PACKAGE_NAME`
- `TEAMS_APP_NAME`
- `TEAMS_SHORT_DESCRIPTION`
- `TEAMS_LONG_DESCRIPTION`
- `TEAMS_DEVELOPER_NAME`
- `TEAMS_DEVELOPER_WEBSITE_URL`
- `TEAMS_DEVELOPER_PRIVACY_URL`
- `TEAMS_DEVELOPER_TERMS_URL`

## Render the manifest

```powershell
$env:APP_URL = 'https://your-public-app.example.com'
$env:TEAMS_APP_ID = '11111111-1111-1111-1111-111111111111'
npm.cmd run teams:manifest
```

## Package for upload

Place `manifest.json`, `color.png`, and `outline.png` together in a zip file.

On Windows PowerShell:

```powershell
Compress-Archive -Path teams/dist/manifest.json,teams/assets/color.png,teams/assets/outline.png -DestinationPath teams/dist/Mastiff-Teams.zip -Force
```

## Current auth model

The manifest packages Mastiff as a Teams personal tab.

- Password login remains available.
- Microsoft sign-in appears automatically when `MICROSOFT_ENTRA_CLIENT_ID`, `MICROSOFT_ENTRA_CLIENT_SECRET`, and `MICROSOFT_ENTRA_TENANT_ID` are configured.
- Full Teams SSO with `webApplicationInfo` is not enabled yet.