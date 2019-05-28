console.log('In frontend.js');

class CommHandler {
  constructor() {
    this.comm = null;
    this.callback = null;
  }

  openComm() {
    if (Jupyter.notebook.kernel == null) {
      throw new Error('Jupyter notebook kernel is not available.');
    }
    this.comm = Jupyter.notebook.kernel.comm_manager.new_comm('foo_comm_target', {
      'foo': -1
    });
    // Register a message handler.
    this.comm.on_msg((msg) => {
      console.log('In on_msg(): msg.content.data = ', msg.content.data);
      if (this.callback != null) {
        this.callback(msg.content.data.foo);
      }
    });
  }

  sendMessage(fooValue) {
    this.comm.send({'foo': fooValue});
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
  const connectButton = document.getElementById('comm-connect-button');
  console.log('connectButton:', connectButton);  // DEBUG
  connectButton.addEventListener('click', () => {
    if (comm == null) {
      comm = new CommHandler();
      comm.registerCallback(fooValue => {
        connectButton.textContent = `Foo value: ${fooValue}`;
      });
      comm.openComm();
    }
    comm.sendMessage(7);
  });
}

main();