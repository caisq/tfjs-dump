import numpy as np
import scipy
from matplotlib import pyplot as plt

r = np.array([1.0] * 4)
plt.subplot(2, 1, 1)
plt.stem(r)
plt.xticks(range(0, 4))
plt.ylabel('Original reward')

plt.subplot(2, 1, 2)
plt.stem(r)
plt.xticks(range(0, 4))
plt.ylabel('Discounted reward')
plt.xlabel('step')

plt.show()

