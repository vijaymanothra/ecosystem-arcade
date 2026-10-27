// ============================================================
//  ECOSYSTEM ARCADE on Azure — everything lives in one resource group.
//
//    Players ─► Static Web App ─┬─ /*      ─► the games
//                               └─ /api/*  ─► Azure Functions ─► Storage Account
//                                                                └─ scores/<game>.json
//
//  Deploy with:  npm run azure:deploy   (see azure/README.md)
// ============================================================

@description('Short name used to build resource names, e.g. "ecosystem-arcade".')
@minLength(3)
@maxLength(30)
param appName string = 'ecosystem-arcade'

@description('Region for the Static Web App. Static Web Apps is offered in: centralus, eastus2, westus2, westeurope, eastasia.')
@allowed(['centralus', 'eastus2', 'westus2', 'westeurope', 'eastasia'])
param staticSiteLocation string = 'eastasia'

@description('Region for the storage account holding the scores.')
param storageLocation string = resourceGroup().location

@description('Free, or Standard (needed for company sign-in, private networking and an SLA).')
@allowed(['Free', 'Standard'])
param staticSiteSku string = 'Free'

@description('Tags for every resource, e.g. owner, costCenter, event, deleteAfter.')
param tags object = {}

@description('Password for wiping scores (DELETE /api/scores). The deploy script generates it.')
@secure()
@minLength(16)
param adminToken string

@description('When the API\'s pass to the score files expires, e.g. 2027-04-25T00:00:00Z. Every deploy issues a fresh one.')
param scoresAccessExpiry string

@description('Sites allowed to call the API from a browser, comma separated. * lets kiosks that open local files send scores.')
param allowedOrigin string = '*'

// globally unique, 3-24 lowercase letters and digits
var storageAccountName = take('st${replace(toLower(appName), '-', '')}${uniqueString(resourceGroup().id)}', 24)

// ---------------------------------------------------------------- the scores
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: storageLocation
  tags: tags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false          // nothing in here is ever public
    allowCrossTenantReplication: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    defaultToOAuthAuthentication: true    // the portal uses your Azure sign-in, not the account key
    publicNetworkAccess: 'Enabled'        // the API's servers have no fixed addresses to allow-list
    encryption: {
      keySource: 'Microsoft.Storage'
      services: { blob: { enabled: true } }
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    isVersioningEnabled: true                                  // every earlier version of a file is kept…
    deleteRetentionPolicy: { enabled: true, days: 7 }          // …deleted files can be undeleted for 7 days
    containerDeleteRetentionPolicy: { enabled: true, days: 7 }
  }
}

resource scoresContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'scores'
  properties: { publicAccess: 'None' }
}

resource lifecycle 'Microsoft.Storage/storageAccounts/managementPolicies@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          name: 'remove-old-versions'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: { blobTypes: ['blockBlob'] }
            actions: { version: { delete: { daysAfterCreationGreaterThan: 30 } } }   // …for 30 days
          }
        }
      ]
    }
  }
  dependsOn: [blobService]
}

// The API's only access to storage: read, create and write inside the "scores" container,
// over HTTPS, until scoresAccessExpiry. No delete, no list, nothing else in the account.
var scoresAccess = storage.listServiceSas('2023-05-01', {
  canonicalizedResource: '/blob/${storage.name}/scores'
  signedResource: 'c'
  signedPermission: 'rcw'
  signedProtocol: 'https'
  signedExpiry: scoresAccessExpiry
}).serviceSasToken

// ---------------------------------------------------------------- the website and API
resource site 'Microsoft.Web/staticSites@2023-12-01' = {
  name: 'swa-${appName}'
  location: staticSiteLocation
  tags: tags
  sku: { name: staticSiteSku, tier: staticSiteSku }
  properties: {
    stagingEnvironmentPolicy: 'Disabled'   // no public preview copies of the site
    allowConfigFileUpdates: true
  }
}

resource siteSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: site
  name: 'appsettings'
  properties: {
    SCORES_CONTAINER_URL: '${storage.properties.primaryEndpoints.blob}scores?${scoresAccess}'
    ADMIN_TOKEN: adminToken
    ALLOWED_ORIGIN: allowedOrigin
  }
  dependsOn: [scoresContainer]
}

output siteUrl string = 'https://${site.properties.defaultHostname}'
output staticSiteName string = site.name
output storageAccountName string = storage.name
