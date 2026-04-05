import { render } from "preact";
import { AudioEngine } from "./audio/engine";
import { App } from "./App";
import "./style.css";

const app = document.getElementById("app");
if (!app) throw new Error("Missing #app");

const engine = new AudioEngine();

render(<App engine={engine} />, app);
