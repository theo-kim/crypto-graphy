import * as React from 'react';

import ClickAwayListener from './ClickAwayListener';

interface IControlMenuOption {
    label : string;
    subOptions : string[];
};

interface IProps {  
}

interface IState {
    controlMenuSelected : number;
}

export default class ControlMenu extends React.Component<IProps, IState> {
    menuOptions : IControlMenuOption[] = [
        { label : "File", subOptions : ["New Project", "New Module", "Import", "Export", "Preferences", "Example Project"] },
        { label : "Edit", subOptions : ["Undo", "Redo", "Export"] },
        { label : "Run", subOptions : ["Module", "Project", "Debugger"] },
        { label : "View", subOptions : ["Toolbar", "Zoom In", "Zoom Out"] }
    ];

    constructor(props : {}) {
        super(props);

        this.state = {
            controlMenuSelected: -1
        };
    }
 
    showSubMenu(index : number) : void {
        this.setState({
            controlMenuSelected: index
        });
    }

    render() {
        let wrapper = (
            <div id="control-menu">
                {this.menuOptions.map((element : IControlMenuOption, index : number) => {
                    return (
                        <div key={index}>
                            <div className={"label " + (this.state.controlMenuSelected == index ? "selected" : "")} 
                                 onClick={() => this.showSubMenu(index)}>
                                {element.label}
                            </div>
                            {
                                (this.state.controlMenuSelected == index) ? (
                                    <ClickAwayListener onClickAway={() => this.showSubMenu(-1)}
                                        className={"sub-menu " + (this.state.controlMenuSelected == index ? "visible" : "")}
                                        key={index}>
                                        {element.subOptions.map((element : string, index: number) => {
                                            return <div key={index}>{element}</div>;
                                        })}
                                    </ClickAwayListener>
                                ) : null
                            }
                            
                        </div>
                    );
                })}
            </div>
        );
        return wrapper;
    };
};