FROM node:22-alpine

WORKDIR /app/frontend

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_DATA_MODE=api
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_DATA_MODE=${NEXT_PUBLIC_DATA_MODE}

RUN pnpm build

CMD ["pnpm", "start", "--", "--host", "0.0.0.0", "--port", "3000"]
