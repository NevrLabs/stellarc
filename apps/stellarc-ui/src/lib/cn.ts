import { type ClassValue, cn as cnBase } from "cn";

export function cn(...inputs: ClassValue[]) {
  return cnBase(...inputs);
}
