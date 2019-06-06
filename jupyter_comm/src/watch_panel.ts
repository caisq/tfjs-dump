/** Summary of a single variable. */
export interface VariableSummary {
    name: string,
    type: string
}

export class DebuggerWatchPanel {

    constructor(private readonly rootDiv: HTMLDivElement) {}

    public renderVariablesSummary(summary: VariableSummary[]) {
        console.log('renderVariablesSummary:', summary);  // DEBUG
        // Clear the div.
        while(this.rootDiv.firstChild != null) {
            this.rootDiv.removeChild(this.rootDiv.firstChild);
        }

        summary.forEach(variable => {
            const variableDiv = document.createElement('div');
            variableDiv.classList.add('debugger-extension-variable-row');

            const nameDiv = document.createElement('div');
            nameDiv.classList.add('debugger-extension-variable-name');
            nameDiv.textContent = variable.name;
            variableDiv.appendChild(nameDiv);

            const typeDiv = document.createElement('div');
            typeDiv.classList.add('debugger-extension-variable-type');
            typeDiv.textContent = variable.type;
            variableDiv.appendChild(typeDiv);

            this.rootDiv.appendChild(variableDiv);
        });
    }
}
