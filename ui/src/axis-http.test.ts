import { describe, expect, it, vi } from "vitest";
import { Schema } from "effect";
import { axisHttp, setAxisOrganization } from "./axis-http";
describe("AxisHttp", () => {
 it("rewrites org paths", async () => { const f=vi.fn(async()=>new Response("{}")); setAxisOrganization("org/a"); await axisHttp.fetch("/api/sessions",{},undefined,f); expect(f).toHaveBeenCalledWith("/api/organizations/org%2Fa/sessions",expect.objectContaining({credentials:"include"})); setAxisOrganization(null); });
 it("keeps global paths", async () => { const f=vi.fn(async()=>new Response("{}")); setAxisOrganization("org"); await axisHttp.fetch("/api/auth/session",{},undefined,f); expect(f).toHaveBeenCalledWith("/api/auth/session",expect.anything()); setAxisOrganization(null); });
 it.each([[401,"AuthRequired"],[409,"Conflict"],[429,"RateLimited"],[500,"HttpError"]] as const)("maps %i", async(status,tag)=>{const f=vi.fn(async()=>new Response("no",{status})); await expect(axisHttp.json("/api/x",Schema.Unknown,{},undefined,f)).rejects.toMatchObject({_tag:tag,status});});
 it("reports decode failures", async()=>{const f=vi.fn(async()=>Response.json({count:"no"})); await expect(axisHttp.json("/api/x",Schema.Struct({count:Schema.Number}),{},undefined,f)).rejects.toMatchObject({_tag:"DecodeError"});});
 it("cancels fetch", async()=>{let signal:AbortSignal|undefined; const f=vi.fn((_i:RequestInfo|URL,init?:RequestInit)=>new Promise<Response>((_r,reject)=>{signal=init?.signal??undefined; signal?.addEventListener("abort",()=>reject(new DOMException("aborted","AbortError")));})); const c=new AbortController(); const p=axisHttp.fetch("/api/x",{},c.signal,f); c.abort(); await expect(p).rejects.toThrow(); expect(signal?.aborted).toBe(true);});
});
