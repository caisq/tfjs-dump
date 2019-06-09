from pygments import highlight
from pygments.lexers import PythonLexer
from pygments.formatters import HtmlFormatter

code = """
print("Hello world")
import tensorflow as tf

tf.enable_eager_execution()

x = tf.constatn([1, 2, 3, 4], dtype=tf.float32)
"""

formatter = HtmlFormatter(linenos='inline', nowrap=True)
code = highlight(code, PythonLexer(), formatter).split('\n')

print(code)
print(formatter.get_style_defs('.highlight'))