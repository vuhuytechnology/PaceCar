export function sepayQrUrl({ bankCode, accountNumber, amount, transferCode }) {
  const url = new URL("https://qr.sepay.vn/img");
  url.search = new URLSearchParams({
    acc: accountNumber,
    bank: bankCode,
    amount: String(amount),
    des: transferCode,
    template: "compact",
  }).toString();
  return url.toString();
}
