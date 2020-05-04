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

class ConsoleEvents {
    listener : () => void = undefined;
    addListener(callback : () => void) {
        this.listener = callback;
    }

}

class Console extends React.Component<IProps, IState> {
    userInput : HTMLDivElement;
    inputBuffer : string[];
    waitingForStateUpdate : boolean;
    
    constructor (props : IProps) {
        super(props);
        this.state = { lines : [] }
        this.inputBuffer = [];
        this.waitingForStateUpdate = false;
    }

    scrollToBottom = () => {
        this.userInput.scrollIntoView();    
    }

    componentDidUpdate() {
        this.scrollToBottom();
        if (this.inputBuffer.length > 0) {
            this.setState(() => {
                let msgs : string[] = this.inputBuffer;
                this.inputBuffer = [];
                return {
                    lines: update(this.state.lines, { $push: msgs })
                }
            });    
        }
        else {
            this.waitingForStateUpdate = false;
        }
    }

    prettyPrint(line : string, key : number) : JSX.Element {
        let isWarning = line.substr(0, "[WARNING]".length) === "[WARNING]";
        let isError = line.substr(0, "[ERROR]".length) === "[ERROR]";
        return (<div className={"console-line" + (isError ? " error" : "") + (isWarning ? " warning" : "")} key={key}>
            { line }
        </div>);
    }

    hook = (msg: string) => {
        if (this.waitingForStateUpdate) this.inputBuffer.push(msg);
        else {
            this.waitingForStateUpdate = true;
            this.setState(() => {
                return {
                    lines: update(this.state.lines, { $push: [ msg ] })
                }
            }); 
        }
    }

    handleSpecialKeys = (e : React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            let command : string = (e.target as HTMLInputElement).value;
            let line : string = appInfo.configurable.ps1 + " " + command;
            (e.target as HTMLInputElement).value = "";
            this.waitingForStateUpdate = true;
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
                                    this.prettyPrint(line, index)
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