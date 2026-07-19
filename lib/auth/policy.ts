type BasicAuthEnv = Partial<Record<"NORTH_STAR_ALLOW_BASIC_AUTH" | "NORTH_STAR_BASIC_AUTH", string>>;

export function basicAuthEnabled(env?: BasicAuthEnv) {
  const source = env ?? process.env;
  return source.NORTH_STAR_ALLOW_BASIC_AUTH === "true" || source.NORTH_STAR_BASIC_AUTH === "true";
}
