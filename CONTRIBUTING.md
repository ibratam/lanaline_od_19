# Contributing

Thanks for contributing! This project follows a simple workflow to keep changes consistent.

## Development Setup

1. Install dependencies:
```bash
npm install
```

2. Create local environment config:
```bash
cp .env.example .env
```

3. Start the app:
```bash
npm run dev
```

## Testing

```bash
# Run the full suite
npm test

# Target a single test file
npm test -- tests/contract/sync.test.js
```

## Linting

```bash
npm run lint
```

## Pull Request Checklist

- Include tests for new behavior
- Keep changes focused and documented
- Ensure lint passes
