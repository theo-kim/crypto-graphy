import * as React from 'react';
import Draggable from 'react-draggable';
import update from 'immutability-helper';

import appInfo from '../appInfo.json';

interface IState {
    lines: string[];
}

class Console extends React.Component<{}, IState> {    
    constructor (props : {}) {
        super(props);
        this.state = { lines : [] }
    }

    handleSpecialKeys = (e : React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            let line : string = (e.target as HTMLInputElement).value;
            (e.target as HTMLInputElement).value = "";
            this.setState(() => {
                return {
                    lines: update(this.state.lines, { $push: [ line ] })
                }
            });
        }
    }
    
    render () {
        return (
            <Draggable
                handle="#console-head"
                bounds="parent">
                <div id="console" >
                    <div id="console-head">Console</div>
                    {
                        this.state.lines.map((line : string, index: number) => {
                            return ( 
                                <div className="console-line" key={index}>
                                    { appInfo.configurable.ps1 }&nbsp;
                                    <input value={line} readOnly />
                                </div>
                            );
                        })
                    }
                    {
                        <div className="console-line">
                            { appInfo.configurable.ps1 }&nbsp;
                            <input onKeyDown={this.handleSpecialKeys} autoFocus/>
                        </div>
                    }
                </div>
            </Draggable>
        );
    }
}

export default Console;