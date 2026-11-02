import http from "k6/http";
import { check, sleep } from "k6";

const scenarios = {
  smoke: {
    executor: "constant-vus",
    vus: 1,
    duration: "60s",
  },
  load: {
    executor: "ramping-vus",
    startVUs: 1,
    stages: [
      { duration: "30s", target: 3 },
      { duration: "60s", target: 3 },
      { duration: "30s", target: 0 },
    ],
  },
  stress: {
    executor: "ramping-vus",
    startVUs: 1,
    stages: [
      { duration: "30s", target: 5 },
      { duration: "30s", target: 10 },
      { duration: "30s", target: 20 },
      { duration: "15s", target: 0 },
    ],
  },
  spike: {
    executor: "ramping-vus",
    startVUs: 1,
    stages: [
      { duration: "5s", target: 20 },
      { duration: "15s", target: 20 },
      { duration: "5s", target: 1 },
      { duration: "15s", target: 1 },
    ],
  },
  soak: {
    executor: "constant-vus",
    vus: 2,
    duration: "5m",
  },
  breakpoint: {
    executor: "ramping-vus",
    startVUs: 1,
    stages: [
      { duration: "20s", target: 5 },
      { duration: "20s", target: 10 },
      { duration: "20s", target: 15 },
      { duration: "20s", target: 20 },
      { duration: "20s", target: 25 },
    ],
  },
  flow: {
    executor: "shared-iterations",
    vus: 1,
    iterations: 1,
  },
};

const testType = __ENV.TEST_TYPE || "smoke";
if (!scenarios[testType])
  throw new Error(`Unknown TEST_TYPE: ${testType}`);

export const options = {
  scenarios: {
    [testType]: scenarios[testType],
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<1500"],
  },
};

const base = __ENV.BASE_URL || "http://localhost:4000/api";

function dateAfter(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function () {
  const startDate = dateAfter(7);
  const endDate = dateAfter(9);
  const search = http.get(
    `${base}/search/cars?limit=24&startDate=${startDate}&startTime=08%3A00&endDate=${endDate}&endTime=20%3A00&driverOption=self`,
  );
  const cars =
    search.status === 200 ? search.json("items") || [] : [];

  check(search, {
    "search returns HTTP 200": (response) => response.status === 200,
  });
  check(cars, {
    "search returns an available car": (items) => items.length > 0,
  });

  if (cars.length > 0) {
    const car = cars[0];
    const detail = http.get(`${base}/cars/${car.id}`);
    check(detail, {
      "car detail returns HTTP 200": (response) => response.status === 200,
    });

    if (testType === "flow" && __ENV.FULL_FLOW === "true") {
      if (!__ENV.TEST_EMAIL || !__ENV.TEST_PASSWORD)
        throw new Error("Set TEST_EMAIL and TEST_PASSWORD for the full flow");

      const login = http.post(
        `${base}/auth/login`,
        JSON.stringify({
          email: __ENV.TEST_EMAIL,
          password: __ENV.TEST_PASSWORD,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
      const token =
        login.status === 200 ? login.json("token") : null;
      check(login, {
        "login returns HTTP 200": (response) => response.status === 200,
      });

      if (token) {
        const quote = http.post(
          `${base}/quotes`,
          JSON.stringify({
            carId: car.id,
            startDate,
            startTime: "08:00",
            endDate,
            endTime: "20:00",
            driverOption: "self",
            pickupOption: "pickup",
          }),
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          },
        );
        check(quote, {
          "quote is created": (response) => response.status === 201,
        });
      }
    }
  }

  sleep(1);
}
