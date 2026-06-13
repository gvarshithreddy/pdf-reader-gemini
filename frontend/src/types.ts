/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TtsChunk {
  id: string; // e.g., "p-0-c-3"
  text: string;
  pageIndex: number;
  startChar: number;
  endChar: number;
}

export interface TextItem {
  str: string;
  startChar: number;
  endChar: number;
  transform: number[];
  width: number;
  height: number;
}

export interface PageTextMap {
  pageIndex: number;
  text: string;
  items: TextItem[];
}

export interface TtsOptions {
  voice: string;
  speed: number;
  pitch: number;
}

export interface ServerConfig {
  ip: string;
  isValidated: boolean;
}
