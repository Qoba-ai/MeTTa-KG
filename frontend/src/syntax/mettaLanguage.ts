import { LanguageSupport, StreamLanguage } from '@codemirror/language';

// Create a simple Metta language based on JavaScript with custom highlighting
export const mettaLanguage = new LanguageSupport(
  StreamLanguage.define({
    name: 'metta',
    startState: () => ({}),
    token: (stream: any) => {
      // Handle comments (lines starting with ;)
      if (stream.match(/^;.*$/)) {
        return 'comment';
      }
      
      // Handle strings
      if (stream.match(/^"[^"]*"/)) {
        return 'string';
      }
      
      // Handle numbers
      if (stream.match(/^\d+/)) {
        return 'number';
      }
      
      // Handle variables (start with $)
      if (stream.match(/^\$[a-zA-Z0-9-]+/)) {
        return 'variable';
      }
      
      // Handle keywords
      const word = stream.match(/^[a-zA-Z][a-zA-Z0-9-]*/);
      if (word) {
        const wordStr = word[0];
        
        // Metta keywords
        const keywords = [
          'if', 'if-error', 'if-equal', '==', 'let', 'not', 'else', 'case', 'then', 'while', 'for', 'def', 'return', 'and', 'or', 'empty',
          'match', 'println', 'trace', 'assertEqualToResult', 'car-atom', 'collapse', 'superpose', 'bind', 'import', 
          'add-reduct', 'pragma', 'remove-atom', 'cdr-atom', 'cons-atom', 'new-space', 'quote', 'assertEqual', 
          'add-atom', 'get-type', 'get-metatype', 'mod-space', 'unify', 'Nil', 'True', 'False', 'Bool', 'Number',
          '$_', '&self', 'empty', 'pow-math', 'sqrt-math', 'abs-math', 'log-math', 'trunc-math', 'ceil-math', 
          'floor-math', 'round-math', 'sin-math', 'asin-math', 'cos-math', 'acos-math', 'tan-math', 'atan-math', 
          'isnan-math', 'isinf-math', 'PI', 'EXP', 'print-mods', 'register-module', 'git-module', 'random-int', 
          'random-float', 'flip', 'new-state', 'change-state', 'get-state', 'get-type-space', 'min-atom', 
          'max-atom', 'size-atom', 'index-atom', 'unique-atom', 'subtraction-atom', 'intersection-atom', 
          'union-atom', '=alpha', 'assertAlphaEqualToResult', 'assertAlphaEqual', 'filter-atom', 'map-atom', 
          'foldl-atom', 'unquote', 'noreduce-eq', 'first-from-pair', 'match-type-or', 'ERROR'
        ];
        
        if (keywords.includes(wordStr)) {
          return 'keyword';
        }
        
        return 'variable';
      }
      
      // Handle operators
      if (stream.match(/^[+\-*/=><%]/)) {
        return 'operator';
      }
      
      // Handle parentheses and brackets
      if (stream.match(/^[(){}[\]]/)) {
        return 'bracket';
      }
      
      // Skip whitespace
      stream.next();
      return null;
    }
  })
); 