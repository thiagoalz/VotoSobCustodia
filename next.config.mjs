/** @type {import('next').NextConfig} */
const config = process.env.STATIC_EXPORT === "1"
  ? {
      output: "export",
      basePath: process.env.PAGES_BASE_PATH || "/VotoSobCustodia",
      trailingSlash: true,
    }
  : {};

export default config;
