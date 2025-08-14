import { loadConfig } from "./config";
import { launch } from "./discord/launch";

(async () => {
    const config = loadConfig();
    await launch(config);
})();