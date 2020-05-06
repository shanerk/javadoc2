# javadoc2

Tool to parse Salesforce Apex code in order to generate Markdown or JSON API documentation.

Inspired and partially based on https://github.com/allnulled/javadoc

## 1. Installation

From within the javadoc2 repo folder run (you may need to sudo):

`~$ npm install -s`

But better, you will want to use the CLI anywhere, so install it globally:

`~$ npm install -g`

To see the help, run:

`javadoc2 --help`

If the above doesn't work, check your node.js installation and try again.

## 2. Features

Support for major Apex language features including:

* Apex Types
  * Classes
  * Interfaces
  * Enums
* Apex Code Structures
  * Methods
  * Abstract Methods
  * Constructors
  * Properties
  * Parameters
  * Return Values

## 3. Javadoc Specification

### Basics
The basic structure of writing document comments is to embed them inside `/** ... */`. The Javadoc is written next to the items without any separating newline. Note that any import statements **must precede** the class declaration.

```java
// import statements

/**
 * @author      Firstname Lastname <address @ example.com>
 * @version     1.6                 (current version number of program)
 * @since       1.2          (the version of the package this class was first added to)
 */
public class Test {
    // class body
}
```

### Methods
For methods there is (1) a short, concise, one line description to explain what the item does. This is followed by (2) a longer description that may span multiple paragraphs. The details can be explained in full here. This section is optional. Lastly, there is (3) a tag section to list the accepted input arguments and return values of the method. Note that all of the Javadoc is treated as HTML so the multiple paragraph sections are separated by a "<p>" paragraph break tag.

```java
/**
 * Short one line description.                           (1)
 * <p>
 * Longer description. If there were any, it would be    (2)
 * here.
 * </p>
 * And even more explanations to follow in consecutive
 * paragraphs separated by HTML paragraph breaks.
 *
 * @param  variable Description text text text.          (3)
 * @return Description text text text.
 */
public int methodName (...) {
    // method body with a return statement
}
```

### Variables
Write and document each variable separately:
```java
/**
 * The horizontal distances of point.
 */
public int x;

/**
 * The vertical distances of point.
 */
public int y;
```

### Special Notation

To add the symbols `*/` inside our javadoc comments, simply write `* /` instead,
and this will be translated to `*/` automatically.

### Summary
*Any comments that do not conform to the specification will be ignored or produce undesired results.*

See the following resources for more on writing Javadocs:
* https://en.wikipedia.org/wiki/Javadoc
* https://www.oracle.com/technical-resources/articles/java/javadoc-tool.html
* https://developer.atlassian.com/server/confluence/javadoc-standards/

## 4. Usage

### Arguments

* `--accessors` Array of accessors to include (default: "global")
* `--include` Array of file patterns to include (default: "**/*.cls" which means all Apex classes within the current directory tree)
* `--exclude` Array of file patterns to exclude
* `--output` The name of the output file, if omitted, output will only go to the terminal window stdout
* `--format` The output format, either "javascript" or "markdown" (default: "markdown")
* `--debug` Emits debug messages if "true" (default: "false")

### Extract documentation by the CLI

Once installed globally, you can run from your terminal:

`~$ javadoc2 -i **/1.cls **/2.cls -o out.md -f markdown -a global public`

Which expands to:

`~$ javadoc2 --include **/1.cls **/2.cls --output out.md --format markdown --accessors global public`