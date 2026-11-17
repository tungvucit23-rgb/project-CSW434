import { registerRootComponent } from "expo";
import App from "./App";
import React from 'react';
import ErrorBoundary from './src/components/common/ErrorBoundary';
function Root() { return React.createElement(ErrorBoundary, null, React.createElement(App)); }
registerRootComponent(Root);
