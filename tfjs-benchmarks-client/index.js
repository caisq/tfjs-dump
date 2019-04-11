const taskTable = document.getElementById('task-table');

async function run() {
  await firebase.initializeApp({
      authDomain: 'jstensorflow.firebaseapp.com',
      projectId: 'jstensorflow'
  });
  console.log('initializeApp DONE');

  const db = firebase.firestore();

  async function getAllTasks() {
    const query = db.collection('Tasks').where('taskType', '==', 'model');
    query.get().then(querySnapshot => {
      const modelAndFunctions = [];
      querySnapshot.forEach(doc => {
        const data = doc.data();
        modelAndFunctions.push([data.taskName, data.functionName]);
      });
      modelAndFunctions.sort();
      modelAndFunctions.forEach(modelAndFunction => {
        const [modelName, functionName] = modelAndFunction;

        const row = document.createElement('tr');
        const modelCell = document.createElement('td');
        modelCell.textContent = modelName;
        modelCell.attributes['modelName'] = modelName;
        modelCell.attributes['functionName'] = functionName;
        modelCell.addEventListener('click', async event => {
          const modelName = event.srcElement.attributes['modelName'];
          const functionName = event.srcElement.attributes['functionName'];
          const {
            endingTimestampMs,
            averageTimeMs,
            environmentTypes,
            hostNames
          } = await getTimingData(modelName, functionName);
          const endingDateTimes = endingTimestampMs.map(t => new Date(t));

          const dataByEnvAndHost = {};
          for (let i = 0; i < environmentTypes.length; ++i) {
            if (environmentTypes[i] == null || hostNames[i] == null) {
              continue;
            }
            const envAndHost = `${environmentTypes[i]}@${hostNames[i]}`;
            if (!(envAndHost in dataByEnvAndHost)) {
              dataByEnvAndHost[envAndHost] = {x: [], y: [], type: 'scatter', name: envAndHost};
            }
            dataByEnvAndHost[envAndHost].x.push(endingDateTimes[i]);
            dataByEnvAndHost[envAndHost].y.push(averageTimeMs[i]);
          }

          const dataArray = [];
          for (const envAndHost in dataByEnvAndHost) {
            dataArray.push(dataByEnvAndHost[envAndHost]);
          }

          Plotly.newPlot('main-plot', dataArray, {
            title: {text: `${modelName}.${functionName}`},
            xaxis: {title: {text: 'Date Time'}},
            yaxis: {title: {text: 'Average Time (ms)'}}
          });
        });
        row.appendChild(modelCell);

        const functionCell = document.createElement('td');
        functionCell.textContent = functionName;
        row.appendChild(functionCell);

        taskTable.appendChild(row);
      });
    });
  }
  await getAllTasks();

  let environmentInfoCache = {};
  async function batchGetEnvironmentInfo(ids) {
    let unknownIds = [];
    ids.forEach(id => {
      if (!(id in environmentInfoCache)) {
        unknownIds.push(id);
      }
    });
    if (unknownIds.length > 0) {
      const collection = db.collection('Environments');
      console.log(`** Downloading environmentInfo for ${ids.length} ids **`);
      const docPromises = ids.map(id => collection.doc(id).get());
      const docs = await Promise.all(docPromises);
      docs.forEach(doc => environmentInfoCache[doc.id] = doc.data());
    }
    return ids.map(id => environmentInfoCache[id]);
  }

  function parseHostName(environmentInfo) {
    if (environmentInfo == null) {
      return null;
    }
    if (environmentInfo.systemInfo == null) {
      return null;
    }
    return environmentInfo.systemInfo.split(' ')[1];
  }

  async function getTimingData(modelName, functionName) {
    return new Promise((resolve, reject) => {
      const query = db.collection('BenchmarkRuns')
          .where('modelName', '==', modelName)
          .where('functionName', '==', functionName)
          .orderBy('endingTimestampMs');
      query.get().then(async querySnapshot => {
        const endingTimestampMs = [];
        const averageTimeMs = [];
        const environmentIds = [];
        const environmentTypes = [];
        const hostNames = [];
        querySnapshot.forEach(async doc => {
          const data = doc.data();
          endingTimestampMs.push(data.endingTimestampMs);
          averageTimeMs.push(data.averageTimeMs);
          environmentIds.push(data.environmentId);
        });

        const infoItems = await batchGetEnvironmentInfo(environmentIds);
        for (let i = 0; i < environmentIds.length; ++i) {
          const environmentInfo = infoItems[i];
          environmentTypes.push(
              environmentInfo == null ? null : environmentInfo.type);
          hostNames.push(parseHostName(environmentInfo));
        }
        resolve({
          endingTimestampMs,
          averageTimeMs,
          environmentTypes,
          hostNames
        });
      }).catch(error => reject(error));
    });
  }
}
run();