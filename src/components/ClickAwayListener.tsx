// SOURCE: https://medium.com/@hasan.shingieti/create-your-own-click-away-listener-using-react-c048e47a0b87

import React from "react";


interface IProps {
    className?: string;
    onClickAway: () => void;
    nodeRef?: Node;
}

interface IState {}

class ClickAwayListener extends React.Component<IProps, IState> {
  // Stores a reference to the containing node
  // This is used when checking where a click is coming from
  node : HTMLDivElement;
  listener : (e : Event) => void;

  constructor(props : IProps) {
    super(props);
    this.node = null;
  }

  handleClickAway() {
    let container = this.node;
    let altContainer = this.props.nodeRef;
    this.listener = (e : Event) => {
        if (container.contains(e.target as HTMLElement)) return;

        // Check if the click came from inside an additional node reference
        // If it did, do nothing
        if (altContainer && altContainer.contains(e.target as HTMLElement)) return;

        // Otherwise, the click happened outside of the click away container
        // So lets execute the click away function
        this.props.onClickAway();
    }
  };

  componentDidMount() {
    // When the component mounts, register a click event that processes the click away
    this.handleClickAway();
    window.addEventListener("click", this.listener, true);
  }

  componentWillUnmount() {
    // When the component unmounts, remove the click event that processes the click away
    window.removeEventListener("click", this.listener, true);
  }

  render() {
    return (
      <div
        ref={ref => this.node = ref}
        className={this.props.className}>
        {this.props.children}
      </div>
    );
  }
};

export default ClickAwayListener;