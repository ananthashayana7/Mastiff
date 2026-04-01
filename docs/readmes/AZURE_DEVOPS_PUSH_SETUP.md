# Azure DevOps Push Setup

This guide prepares Mastiff for Azure DevOps Repos + Pipelines using `azure-pipelines.yml` at repo root.

## 1. Create Azure DevOps Project And Repo

1. In Azure DevOps, create a new project (or use existing).
2. Create a new Git repo named `Mastiff`.
3. Copy the repo URL from Azure DevOps, e.g.:
   - `https://dev.azure.com/<org>/<project>/_git/Mastiff`

## 2. Push Local Repository To Azure DevOps

Run from `C:\Netflix\Mastiff`:

```powershell
git remote add azure https://dev.azure.com/<org>/<project>/_git/Mastiff
git fetch azure
git push azure main
git push azure develop
```

If `azure` already exists:

```powershell
git remote set-url azure https://dev.azure.com/<org>/<project>/_git/Mastiff
git push azure main
```

## 3. Create The Pipeline

1. Azure DevOps -> Pipelines -> New Pipeline.
2. Choose `Azure Repos Git` and select `Mastiff`.
3. Choose `Existing Azure Pipelines YAML file`.
4. Select `/azure-pipelines.yml`.
5. Save and run.

## 4. Configure Pipeline Variables

Pipeline -> Edit -> Variables:

1. `BuildDocker` = `false` (default).
2. `NodeVersion` = `20.x`.
3. `ContainerRepository` = `mastiff` (if Docker stage is used).

No secrets are required for Validate stage.

## 5. Optional Docker Build Configuration

To enable Docker stage:

1. Set pipeline variable `BuildDocker` = `true`.
2. Ensure your agent supports Docker (Microsoft-hosted ubuntu does).
3. If you also want push-to-registry, update Docker task with a service connection and `command: buildAndPush`.

## 6. Branch Policies (Recommended)

Project Settings -> Repos -> Branches:

For `main`:
1. Require pull request.
2. Require successful build validation from this pipeline.
3. Require at least 1 reviewer.
4. Reset approvals on new pushes.

## 7. Required App Runtime Secrets (Deployment Stage / Runtime)

These are not needed for plain CI build, but are needed when deploying/running app:

1. `DATABASE_URL`
2. `JWT_SECRET`
3. `NEXTAUTH_SECRET`
4. `ENCRYPTION_KEY`
5. `API_KEY` or `GEMINI_API_KEY`
6. SharePoint (if used):
   - `SHAREPOINT_TENANT_ID`
   - `SHAREPOINT_CLIENT_ID`
   - `SHAREPOINT_CLIENT_SECRET`
   - `SHAREPOINT_REDIRECT_URI`

Store secrets in:
1. Azure DevOps Library -> Variable Groups, or
2. Azure Key Vault linked variable group.

## 8. First Run Checklist

1. Pipeline triggers on push to `main` or `develop`.
2. `npm ci` succeeds.
3. `npm run test -- --run` succeeds.
4. `npm run build` succeeds.
5. Build artifact `mastiff-source` is published.

## 9. Known Current Constraint

Full repository `type-check` is currently not enabled in `azure-pipelines.yml` because there are pre-existing TypeScript errors unrelated to this Azure setup.

When fixed, enable by uncommenting the step in `azure-pipelines.yml`:

```yaml
- script: npm run type-check
  displayName: Type check
```

## 10. Quick Validation Commands (Local)

```powershell
npm.cmd ci
npm.cmd run lint --if-present
npm.cmd run test -- --run
npm.cmd run build
```

If all pass locally, Azure pipeline should behave similarly.
