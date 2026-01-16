# {{PROJECT_NAME}}

A todo list app built with [Convoy](https://github.com/hamzatekin/convoy).

## Getting Started

1. **Set up the database**

   Copy `.env.example` to `.env` and update the database connection string:

   ```bash
   cp .env.example .env
   ```

2. **Start the Convoy server**

   ```bash
   npx convoy dev
   ```

   This will:
   - Sync your schema to the database
   - Generate typed API bindings
   - Start the HTTP server on port 3000
   - Watch for changes

3. **Start the frontend**

   In a separate terminal:

   ```bash
   npm run dev
   ```

   Open [http://localhost:5173](http://localhost:5173) to see your app.

## Project Structure

```
├── convoy/
│   ├── schema.ts           # Database schema (tables + indexes)
│   ├── functions/          # Server functions (queries + mutations)
│   │   ├── lists.ts
│   │   └── todos.ts
│   └── _generated/         # Auto-generated (don't edit)
├── src/
│   ├── App.tsx             # React app
│   ├── main.tsx            # Entry point
│   └── styles.css          # Styles
└── ...
```

## Features Demonstrated

- **Schema with references**: `todos.listId` references `lists`
- **Indexes**: `by_listId` index for efficient queries
- **Real-time updates**: Changes sync automatically via SSE
- **Transactions**: Deleting a list atomically removes all its todos
- **Batch operations**: `clearCompleted` uses `deleteMany`
- **Pagination**: Todo list uses `limit` and `offset`

## Learn More

- [Convoy Documentation](https://github.com/hamzatekin/convoy#readme)
- [Convoy Roadmap](https://github.com/hamzatekin/convoy/blob/main/ROADMAP.md)
