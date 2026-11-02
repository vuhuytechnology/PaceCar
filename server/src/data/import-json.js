import { closeStore, importJsonFileToPostgres } from "./store.js";

const jsonFile = process.argv[2];

try {
  if (!jsonFile) {
    throw new Error(
      "Usage: npm run db:import-json -- <path-to-existing-db.json>",
    );
  }
  const data = await importJsonFileToPostgres(jsonFile);
  console.log(
    `Imported PaceCar JSON data: ${Object.keys(data).length} collections.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closeStore();
}
