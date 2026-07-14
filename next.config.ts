import type { NextConfig } from "next";

const buildCommitSha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.BUILD_SHA ||
  "local-unset";

if (!/^[A-Za-z0-9._-]{7,64}$/.test(buildCommitSha)) {
  throw new Error("Build SHA must be a safe 7-64 character identifier.");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    BUILD_COMMIT_SHA: buildCommitSha,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
