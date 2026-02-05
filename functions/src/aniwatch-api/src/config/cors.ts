import { cors } from "hono/cors";
import { env } from "./env.js";

const DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001", 
    "http://localhost:4000",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://localhost:8081",
    "http://localhost:8082",
    "http://localhost:8083",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:8081",
    "http://127.0.0.1:8082",
    "http://127.0.0.1:8083",
    "*"
];

const allowedOrigins = env.ANIWATCH_API_CORS_ALLOWED_ORIGINS
    ? env.ANIWATCH_API_CORS_ALLOWED_ORIGINS.split(",")
    : DEFAULT_ALLOWED_ORIGINS;

export const corsConfig = cors({
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 600,
    credentials: true,
    origin: allowedOrigins,
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposeHeaders: ["Content-Length", "X-Total-Count"],
});
