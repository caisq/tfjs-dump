console.log('In frontend.js');

class CommHandler {
  constructor() {
    this.comm = null;
    this.callback = null;
  }

  openComm() {
    console.log('In openComm()');  // DEBUG
    if (Jupyter.notebook.kernel == null) {
      throw new Error('Jupyter notebook kernel is not available.');
    }
    this.comm = Jupyter.notebook.kernel.comm_manager.new_comm('debugger_comm_target', {
      'foo': -1
    });
    // Register a message handler.
    this.comm.on_msg((msg) => {
      console.log('In on_msg(): msg.content.data = ', msg.content.data);
      if (this.callback != null) {
        this.callback(msg.content.data);
      }
    });
  }

  sendMessage(msg) {
    this.comm.send(msg);
  }

  registerCallback(callback) {
    this.callback = callback;
  }
}

function main() {
  const extensionDiv = document.getElementById('extension-div');
  const childDiv = document.createElement('div');
  childDiv.textContent = 'Child Div';
  extensionDiv.appendChild(childDiv);

  let comm;
  const stepButton = document.getElementById('step-button');
  console.log('stepButton:', stepButton);  // DEBUG
  stepButton.addEventListener('click', () => {
    console.log('stepButton clicked');  // DEBUG
    if (comm == null) {
      comm = new CommHandler();
      comm.registerCallback(incomingValue => {
        stepButton.textContent = `Incoming value: ${JSON.stringify(incomingValue)}`;
      });
      comm.openComm();
    }
    comm.sendMessage();
  });
}

main();
