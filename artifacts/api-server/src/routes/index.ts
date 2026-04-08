import { Router, type IRouter } from "express";
import healthRouter from "./health";
import uploadsRouter from "./uploads";
import pliegosRouter from "./pliegos";
import authRouter from "./auth";
import adminRouter from "./admin";
import stripeRouter from "./stripe";
import chatRouter from "./chat";
import yukiRouter from "./yuki";
import githubRouter from "./github";
import yukiConversationsRouter from "./yuki-conversations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(uploadsRouter);
router.use(pliegosRouter);
router.use(adminRouter);
router.use(stripeRouter);
router.use(chatRouter);
router.use(yukiRouter);
router.use(githubRouter);
router.use(yukiConversationsRouter);

export default router;
