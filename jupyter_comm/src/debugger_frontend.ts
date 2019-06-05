console.log('In frontend.ts');

export interface DebuggerFrameData {
  step_count: number;

  event: 'call' | 'line' | 'return';

  source_line: string|null;

  filename: string;

  function_name: string;
}

export interface JupyterClass {
  notebook: JupyterNotebook;
}

export interface JupyterNotebook {
  kernel: JupyterNotebookKernel;
}

export interface JupyterNotebookKernel {
  comm_manager: JupyterNotebookCommManager;
}

export interface JupyterNotebookCommManager {
  new_comm: (name: string, message: {}) => any;
}

declare const Jupyter: JupyterClass;

export interface JupyterCommMessage {
  content: JupyterCommMessageData;
}

export interface JupyterCommMessageData {
  data: {};
}

export type CodeLinesCallback = (lines: string[]) => Promise<void>|void;
export type FrameDataCallback =
    (frameData: DebuggerFrameData) => Promise<void>|void;

class CommHandler {
  private comm: any;
  private codeLinesCallback: CodeLinesCallback|null = null;
  private frameDataCallback: FrameDataCallback|null = null;


  constructor() {
    this.comm = null;
  }

  openComm() {
    console.log('In openComm()');  // DEBUG
    if (Jupyter.notebook.kernel == null) {
      throw new Error('Jupyter notebook kernel is not available.');
    }
    this.comm = Jupyter.notebook.kernel.comm_manager.new_comm(
        'debugger_comm_target', {'foo': -1});
    // Register a message handler.
    this.comm.on_msg((msg: JupyterCommMessage) => {
      const data = msg.content.data;
      console.log('In on_msg(): data = ', data);  // DEBUG

      if ('code_lines' in data && this.codeLinesCallback != null) {
        this.codeLinesCallback(data['code_lines'] as string[]);
      } else if ('event' in data && this.frameDataCallback != null) {
        this.frameDataCallback(data as DebuggerFrameData);
      }
    });
  }

  sendMessage(msg: {}) {
    this.comm.send(msg);
  }

  registerFrameDataCallback(callback: FrameDataCallback) {
    this.frameDataCallback = callback;
  }

  registerCodeLinesCallback(callback: CodeLinesCallback) {
    this.codeLinesCallback = callback;
  }
}

function renderCodeLines(rootDiv: HTMLDivElement, codeLines: string[]): void {
  console.log('In renderCodeLines()');
  for (const line of codeLines) {
    const linePre = document.createElement('pre');
    linePre.textContent = line;
    rootDiv.appendChild(linePre);
  }
}

function main() {
  const extensionDiv =
      document.getElementById('extension-div') as HTMLDivElement;
  const childDiv = document.createElement('div');
  childDiv.textContent = 'Child Div';
  extensionDiv.appendChild(childDiv);
  const codeDiv = document.createElement('div');
  codeDiv.textContent = 'Waiting for Python source code...';
  extensionDiv.appendChild(codeDiv);

  let comm: CommHandler;
  const stepButton =
      document.getElementById('step-button') as HTMLButtonElement;
  console.log('stepButton:', stepButton);  // DEBUG
  stepButton.addEventListener('click', () => {
    console.log('stepButton clicked');  // DEBUG
    if (comm == null) {
      comm = new CommHandler();

      comm.registerCodeLinesCallback((codeLines: string[]) => {
        codeDiv.textContent = '';
        renderCodeLines(codeDiv, codeLines);
      });

      comm.registerFrameDataCallback(incomingValue => {
        stepButton.textContent = `Incoming value: ${JSON.stringify(incomingValue)}`;
      });
      comm.openComm();
    }
    comm.sendMessage({});
  });
}

main();
