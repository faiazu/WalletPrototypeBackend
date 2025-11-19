import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { signInWithGoogle } from "./googleAuthService.js";

const router = Router();

const bodySchema = z.object({
  idToken: z.string().min(1),
});

router.post("/google", async (req: Request, res: Response) => {
  try {
    const { idToken } = bodySchema.parse(req.body);

    const result = await signInWithGoogle(idToken);

    res.json(result);
  } catch (err: any) {
    console.error(err);

    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request body", details: err.errors });
    }

    return res.status(400).json({ error: err.message ?? "Authentication failed" });
  }
});

export const authRouter = router;
