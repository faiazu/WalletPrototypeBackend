import "./config.js";
import { PrismaClient } from "../generated/prisma/client.js";

export const prisma = new PrismaClient();
