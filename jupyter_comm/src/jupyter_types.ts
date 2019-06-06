
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

export interface JupyterCommMessage {
  content: JupyterCommMessageData;
}

export interface JupyterCommMessageData {
  data: {};
}