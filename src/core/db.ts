import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "../generated/prisma/client.js"

export const prisma = new PrismaClient();
