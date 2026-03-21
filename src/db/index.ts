import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import * as connectorSchema from "./connectorSchema";
import * as scheduledReportSchema from "./scheduledReportSchema";
import * as templateSchema from "./templateSchema";
import * as agentSchema from "./agentSchema";
import * as notebookSchema from "./notebookSchema";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, {
    schema: {
        ...schema,
        ...connectorSchema,
        ...scheduledReportSchema,
        ...templateSchema,
        ...agentSchema,
        ...notebookSchema,
    },
});
