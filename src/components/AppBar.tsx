import * as React from 'react';

import * as appInfo from '../appInfo.json';

import ControlMenu from './ControlMenu';

export default class AppBar extends React.Component {
    render() {
        return (
            <div id="app-bar">
                {appInfo.appName}
                <ControlMenu />
            </div>);
    };
};