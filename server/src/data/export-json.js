import { closeStore, exportPostgresToJsonFile } from "./store.js";

const jsonFile = process.argv[2];

try {
  if (!jsonFile) {
    throw new Error(
      "Usage: npm run db:export-json -- <output-path.json>",
    );
  }
  const data = await exportPostgresToJsonFile(jsonFile);
  console.log(
    `Exported PaceCar JSON data: ${Object.keys(data).length} collections.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closeStore();
}
