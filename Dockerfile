FROM node:20
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV BASE_PATH=/
# cache-bust: 2026-04-05q
COPY . .
RUN rm -rf artifacts/api-server/dist artifacts/dtf-pliego/dist
RUN npm install -g pnpm
RUN pnpm install --no-frozen-lockfile
RUN echo 'import Anthropic from "@anthropic-ai/sdk";const apiKey=process.env.ANTHROPIC_API_KEY||process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY||"";const baseURL=process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL||"https://api.anthropic.com";export const anthropic=new Anthropic({apiKey,baseURL});' > /app/lib/integrations-anthropic-ai/src/client.ts
RUN pnpm --filter @workspace/api-server run build
RUN pnpm --filter @workspace/dtf-pliego run build
EXPOSE 3000
CMD ["node", "artifacts/api-server/dist/index.mjs"]
