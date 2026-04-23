export const MAX_CUSTOMER_PHOTO_SIZE_BYTES = 1024 * 1024;

export function getCustomerInitials(name) {
  const words = (name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!words.length) {
    return "M";
  }

  return words.map((word) => word[0].toUpperCase()).join("");
}

export function readCustomerPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file."));
      return;
    }

    if (file.size > MAX_CUSTOMER_PHOTO_SIZE_BYTES) {
      reject(new Error("Please choose an image smaller than 1 MB."));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read this image."));
    reader.readAsDataURL(file);
  });
}
