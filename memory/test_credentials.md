# Test Credentials

## Admin Account
- Username: `error707mty`
- Password: `buentello0607`
- Role: Admin (has Yuki IDE access)

## Yuki IDE Access
Only the user `error707mty` has exclusive access to Yuki IDE.

## Database
- PostgreSQL database configured via environment variables
- Drizzle ORM for schema management

## GitHub Integration (Yuki)
- User must configure their own GitHub Personal Access Token via Yuki settings
- Token is stored in `/app/artifacts/api-server/.github-config.json`

## API Keys
- DeepSeek API key (or other AI providers) must be configured by user via Yuki settings
- Stored in `/app/artifacts/api-server/.yuki-config.json`
