// Aggregate all mock auth routes here

import { mockLoginRoutes } from "./routes/mockLoginRoutes.js";
import { mockRegisterRoutes } from "./routes/mockRegisterRoutes.js";
import { mockListUsersRoutes } from "./routes/mockListUsersRoutes.js";

export const mockAuth = {
  login: mockLoginRoutes,
  register: mockRegisterRoutes,
  listUsers: mockListUsersRoutes,
};