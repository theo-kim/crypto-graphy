import * as React from 'react';
import Draggable from 'react-draggable';
import update from 'immutability-helper';

import appInfo from '../appInfo.json';

interface IProps {
    onCommand: (command : string, furtherInfoHook : (msg: string) => void) => string[];
}

interface IState {
    lines: string[];
}

class Console extends React.Component<IProps, IState> {
    userInput : HTMLDivElement;
    
    constructor (props : IProps) {
        super(props);
        this.state = { lines : [] }
    }

    scrollToBottom = () => {
        this.userInput.scrollIntoView();    
    }

    componentDidUpdate() {
        this.scrollToBottom();
    }

    hook = (msg: string) => {
        this.setState(() => {
            return {
                lines: update(this.state.lines, { $push: [ msg ] })
            }
        });
    }

    handleSpecialKeys = (e : React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            let command : string = (e.target as HTMLInputElement).value;
            let line : string = appInfo.configurable.ps1 + " " + command;
            (e.target as HTMLInputElement).value = "";
            this.setState(() => {
                let response : string[] = this.props.onCommand(command, this.hook);
                response.unshift(line);
                return {
                    lines: update(this.state.lines, { $push: response })
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
                    <div id="console-body">
                        {
                            this.state.lines.map((line : string, index: number) => {
                                return ( 
                                    <div className="console-line" key={index}>
                                        { line }
                                    </div>
                                );
                            })
                        }
                        {
                            <div className="console-line" ref={(el) => { this.userInput = el; }}>
                                { appInfo.configurable.ps1 }&nbsp;
                                <input onKeyDown={this.handleSpecialKeys} autoFocus/>
                            </div>
                        }
                    </div>
                </div>
            </Draggable>
        );
    }
}

export default Console;