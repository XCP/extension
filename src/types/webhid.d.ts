/**
 * WebHID API Type Declarations
 *
 * Provides types for the WebHID API used for hardware wallet detection.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API
 */

interface HIDDevice {
  readonly opened: boolean;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  readonly collections: HIDCollectionInfo[];

  open(): Promise<void>;
  close(): Promise<void>;
  forget(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
  receiveFeatureReport(reportId: number): Promise<DataView>;

  oninputreport: ((this: HIDDevice, ev: HIDInputReportEvent) => void) | null;
  addEventListener(
    type: 'inputreport',
    listener: (this: HIDDevice, ev: HIDInputReportEvent) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener(
    type: 'inputreport',
    listener: (this: HIDDevice, ev: HIDInputReportEvent) => void,
    options?: boolean | EventListenerOptions
  ): void;
}

interface HIDCollectionInfo {
  usagePage: number;
  usage: number;
  type: number;
  children: HIDCollectionInfo[];
  inputReports: HIDReportInfo[];
  outputReports: HIDReportInfo[];
  featureReports: HIDReportInfo[];
}

interface HIDReportInfo {
  reportId: number;
  items: HIDReportItem[];
}

interface HIDReportItem {
  isAbsolute: boolean;
  isArray: boolean;
  isBufferedBytes: boolean;
  isConstant: boolean;
  isLinear: boolean;
  isRange: boolean;
  isVolatile: boolean;
  hasNull: boolean;
  hasPreferredState: boolean;
  wrap: boolean;
  usages: number[];
  usageMinimum: number;
  usageMaximum: number;
  reportSize: number;
  reportCount: number;
  unitExponent: number;
  unitSystem: string;
  unitFactorLengthExponent: number;
  unitFactorMassExponent: number;
  unitFactorTimeExponent: number;
  unitFactorTemperatureExponent: number;
  unitFactorCurrentExponent: number;
  unitFactorLuminousIntensityExponent: number;
  logicalMinimum: number;
  logicalMaximum: number;
  physicalMinimum: number;
  physicalMaximum: number;
  strings: string[];
}

interface HIDInputReportEvent extends Event {
  readonly device: HIDDevice;
  readonly reportId: number;
  readonly data: DataView;
}

interface HIDDeviceFilter {
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
}

interface HIDDeviceRequestOptions {
  filters: HIDDeviceFilter[];
}

interface HID extends EventTarget {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]>;

  onconnect: ((this: HID, ev: HIDConnectionEvent) => void) | null;
  ondisconnect: ((this: HID, ev: HIDConnectionEvent) => void) | null;

  addEventListener(
    type: 'connect',
    listener: (this: HID, ev: HIDConnectionEvent) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  addEventListener(
    type: 'disconnect',
    listener: (this: HID, ev: HIDConnectionEvent) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener(
    type: 'connect',
    listener: (this: HID, ev: HIDConnectionEvent) => void,
    options?: boolean | EventListenerOptions
  ): void;
  removeEventListener(
    type: 'disconnect',
    listener: (this: HID, ev: HIDConnectionEvent) => void,
    options?: boolean | EventListenerOptions
  ): void;
}

interface HIDConnectionEvent extends Event {
  readonly device: HIDDevice;
}

interface Navigator {
  readonly hid: HID;
}
