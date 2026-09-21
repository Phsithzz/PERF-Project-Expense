import {
  getAccessToken,
  notifyUnauthorized,
  resetTokenStoreForTests,
  setAccessToken,
  subscribeToUnauthorized,
} from "./token-store";

describe("token store", () => {
  beforeEach(resetTokenStoreForTests);

  it("keeps the access token in memory and notifies subscribers when unauthorized", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToUnauthorized(listener);
    setAccessToken("access-token");

    notifyUnauthorized();

    expect(getAccessToken()).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("stops notifying an unsubscribed listener", () => {
    const listener = vi.fn();
    subscribeToUnauthorized(listener)();

    notifyUnauthorized();

    expect(listener).not.toHaveBeenCalled();
  });
});
