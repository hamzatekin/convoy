import type { input, ZodObject, ZodRawShape } from "zod";
import type { ConvoyFunction } from "./server";

type ArgsOfFunction<TFunc> =
  TFunc extends ConvoyFunction<any, infer TArgs, any>
    ? input<ZodObject<TArgs>>
    : never;

type ResultOfFunction<TFunc> =
  TFunc extends ConvoyFunction<any, any, infer TResult>
    ? Awaited<TResult>
    : never;

export type QueryRef<Name extends string, Args, Result> = {
  kind: "query";
  name: Name;
  __args: Args;
  __result: Result;
};

export type MutationRef<Name extends string, Args, Result> = {
  kind: "mutation";
  name: Name;
  __args: Args;
  __result: Result;
};

export type ApiRef = QueryRef<string, unknown, unknown> | MutationRef<string, unknown, unknown>;

export type ArgsOfRef<TRef> = TRef extends { __args: infer TArgs } ? TArgs : never;
export type ResultOfRef<TRef> =
  TRef extends { __result: infer TResult } ? TResult : never;

type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export type ConvoyClientOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
};

async function callApi<T>(
  kind: "query" | "mutation",
  name: string,
  args: unknown,
  options?: ConvoyClientOptions,
): Promise<T> {
  const baseUrl = options?.baseUrl ?? "";
  const fetcher = options?.fetch ?? fetch;
  if (!fetcher) {
    throw new Error("fetch is not available");
  }

  const response = await fetcher(`${baseUrl}/api/${kind}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args ?? {}),
  });
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Request failed");
  }
  if (payload.data === undefined) {
    throw new Error("Missing response payload");
  }
  return payload.data;
}

export type ConvoyClient = {
  query: <TRef extends QueryRef<string, any, any>>(
    ref: TRef,
    args: ArgsOfRef<TRef>,
  ) => Promise<ResultOfRef<TRef>>;
  mutation: <TRef extends MutationRef<string, any, any>>(
    ref: TRef,
    args: ArgsOfRef<TRef>,
  ) => Promise<ResultOfRef<TRef>>;
};

export function createConvoyClient(
  options?: ConvoyClientOptions,
): ConvoyClient {
  return {
    query: async <TRef extends QueryRef<string, any, any>>(
      ref: TRef,
      args: ArgsOfRef<TRef>,
    ) => {
      if (ref.kind !== "query") {
        throw new Error("Expected a query reference");
      }
      return callApi<ResultOfRef<TRef>>("query", ref.name, args, options);
    },
    mutation: async <TRef extends MutationRef<string, any, any>>(
      ref: TRef,
      args: ArgsOfRef<TRef>,
    ) => {
      if (ref.kind !== "mutation") {
        throw new Error("Expected a mutation reference");
      }
      return callApi<ResultOfRef<TRef>>(
        "mutation",
        ref.name,
        args,
        options,
      );
    },
  };
}

export function makeQueryRef<
  Name extends string,
  TFunc extends ConvoyFunction<any, ZodRawShape, any>,
>(
  name: Name,
  _fn: TFunc,
): QueryRef<Name, ArgsOfFunction<TFunc>, ResultOfFunction<TFunc>> {
  return { kind: "query", name } as QueryRef<
    Name,
    ArgsOfFunction<TFunc>,
    ResultOfFunction<TFunc>
  >;
}

export function makeMutationRef<
  Name extends string,
  TFunc extends ConvoyFunction<any, ZodRawShape, any>,
>(
  name: Name,
  _fn: TFunc,
): MutationRef<Name, ArgsOfFunction<TFunc>, ResultOfFunction<TFunc>> {
  return { kind: "mutation", name } as MutationRef<
    Name,
    ArgsOfFunction<TFunc>,
    ResultOfFunction<TFunc>
  >;
}
