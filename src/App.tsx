import * as React from 'react';

import AppBar from './components/AppBar';
import WorkSpace from './components/WorkSpace';

export default class App extends React.Component {
    render() {
        return (<div id="app"><AppBar /><WorkSpace /></div>);
    };
};