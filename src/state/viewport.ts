export type DeviceGroup = "Desktop" | "Tablet" | "Phone";

export interface DevicePreset {
  id: string;
  label: string;
  group: DeviceGroup;
  width: number;
  height: number;
}

export const FIT_DEVICE_ID = "fit";

export const DEVICE_GROUPS: DeviceGroup[] = ["Desktop", "Tablet", "Phone"];

export const DEVICES: DevicePreset[] = [
  { id: FIT_DEVICE_ID, label: "Fit to window", group: "Desktop", width: 0, height: 0 },
  { id: "desktop-1920", label: "Full HD monitor", group: "Desktop", width: 1920, height: 1080 },
  { id: "desktop-1440", label: "Desktop", group: "Desktop", width: 1440, height: 900 },
  { id: "laptop-1366", label: "Budget laptop", group: "Desktop", width: 1366, height: 768 },
  { id: "laptop-1280", label: "Small laptop", group: "Desktop", width: 1280, height: 800 },
  { id: "ipad-pro-13", label: "iPad Pro 12.9″", group: "Tablet", width: 1024, height: 1366 },
  { id: "ipad-air", label: "iPad Air", group: "Tablet", width: 820, height: 1180 },
  { id: "ipad-mini", label: "iPad mini", group: "Tablet", width: 768, height: 1024 },
  { id: "android-tablet", label: "Android tablet", group: "Tablet", width: 800, height: 1280 },
  { id: "iphone-pro-max", label: "iPhone 15 Pro Max", group: "Phone", width: 430, height: 932 },
  { id: "iphone", label: "iPhone 15", group: "Phone", width: 393, height: 852 },
  { id: "pixel", label: "Pixel 8", group: "Phone", width: 412, height: 915 },
  { id: "galaxy", label: "Galaxy S23", group: "Phone", width: 360, height: 780 },
  { id: "iphone-se", label: "iPhone SE", group: "Phone", width: 375, height: 667 }
];

export const DEFAULT_DEVICE_FOR_GROUP: Record<DeviceGroup, string> = {
  Desktop: "desktop-1440",
  Tablet: "ipad-air",
  Phone: "iphone"
};

export const CUSTOM_DEVICE_ID = "custom";

export interface CustomSize {
  width: number;
  height: number;
}

export const DEFAULT_CUSTOM_SIZE: CustomSize = { width: 1024, height: 768 };
export const CUSTOM_SIZE_LIMITS = { min: 240, max: 3840 };

function groupForWidth(width: number): DeviceGroup {
  return width <= 700 ? "Phone" : width <= 1100 ? "Tablet" : "Desktop";
}

export function getDevice(id: string, custom: CustomSize = DEFAULT_CUSTOM_SIZE): DevicePreset {
  if (id === CUSTOM_DEVICE_ID) {
    return { id, label: "Custom size", group: groupForWidth(custom.width), width: custom.width, height: custom.height };
  }
  return DEVICES.find((d) => d.id === id) ?? DEVICES[0];
}

export function canRotate(device: DevicePreset): boolean {
  return device.group !== "Desktop" && device.id !== CUSTOM_DEVICE_ID;
}

export function viewportSize(deviceId: string, landscape: boolean, custom?: CustomSize): { width: number; height: number } | null {
  const device = getDevice(deviceId, custom);
  if (device.id === FIT_DEVICE_ID) return null;
  return landscape && canRotate(device)
    ? { width: device.height, height: device.width }
    : { width: device.width, height: device.height };
}

